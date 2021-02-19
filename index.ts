import { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'
import {
  allPass,
  complement,
  either,
  equals,
  isEmpty,
  isNil,
  mergeAll,
  omit,
  pathEq,
  pathOr,
  propOr,
  pipe,
  when
} from 'ramda'
import isRetryAllowed from './_internal/isRetryAllowed'

/**
 * This is our axios namespace so we can access our stuff easily
 */
const namespace = 'axios-trials'
const SAFE_HTTP_METHODS = ['get', 'head', 'options']
const IDEMPOTENT_HTTP_METHODS = SAFE_HTTP_METHODS.concat(['put', 'delete'])

export interface RetryConfig {
  retries: number
  retryCondition?: (a?: Error) => boolean
  delayFn?: (retryCount?: number, error?: AxiosError) => number
  shouldResetTimeout?: boolean
}

export interface RetryState extends RetryConfig {
  retryCount: number
  lastRequestTime: number
}

/**
 * A function that checks if the value is either empty or null/undefined
 */
const isEitherNilOrEmpty = either(isNil, isEmpty)

/**
 * Gets the request objects from the axios namespace
 * @param config Axios Config object
 * @param defaultOptions Options object
 */
function getRequestOptions (config: AxiosRequestConfig, defaultOptions: RetryConfig): RetryConfig {
  return Object.assign({}, defaultOptions, propOr({}, namespace, config))
}

/**
 * Checks to see if its a valid error we can retry on
 * @param error An Axios Error
 */
function isRetryableError (error: AxiosError): boolean {
  return (
    error.code !== 'ECONNABORTED' &&
    (isNil(error.response) || (error.response.status >= 500 && error.response.status <= 599))
  )
}

/**
 * Gets the current state of the namespace within axios
 * @param config Axios Config
 */
function getCurrentState (config: AxiosRequestConfig): RetryState {
  const currentState: RetryState = propOr(config, namespace, config)

  currentState.retryCount = currentState.retryCount ?? 0

  return currentState
}

/**
 * Processes and fixes the axios config where axios fails to merge the config in properly
 * @param axios Axios Instance
 * @param config The Axios config
 */
function fixConfig (axios: AxiosInstance, config: AxiosRequestConfig): AxiosRequestConfig {
  const safetyPath = pathOr('')
  const fix = pipe(
    when(
      pathEq(['agent'], safetyPath(['defaults', 'agent'], axios)),
      omit(['agent'])
    ),
    when(
      pathEq(['agent'], safetyPath(['defaults', 'httpAgent'], axios)),
      omit(['agent'])
    ),
    when(
      pathEq(['agent'], safetyPath(['defaults', 'httpsAgent'], axios)),
      omit(['agent'])
    )
  )

  return fix(config)
}

/**
 * Checks if the error given back from axios is a network error or not
 * @param error An Axios error
 */
function isNetworkError (error: AxiosError): boolean {
  return (
    isNil(error.response) &&
    Boolean(error.code) && // Prevents retrying cancelled requests
    error.code !== 'ECONNABORTED' && // Prevents retrying timed out requests
    isRetryAllowed(error) // Prevents retrying unsafe errors
  )
}

/**
 * Check if the error given back from axios is an Idempotent error or not
 * @param error An Axios Error
 */
function isIdempotentRequestError (error: AxiosError): boolean {
  if (isEitherNilOrEmpty(error.config)) {
    // Cannot determine if the request can be retried
    return false
  }

  return isRetryableError(error) && IDEMPOTENT_HTTP_METHODS.includes(error.config.method ?? '')
}

/**
 * Checks if the error given back from axios is either network or Idempotent
 * @param error An Axios error
 */
const isNetworkOrIdempotentRequestError = either(isNetworkError, isIdempotentRequestError)

export function exponentialDelay (retryNumber: number, _: AxiosError): number {
  const delay = Math.pow(2, retryNumber) * 100
  const randomSum = delay * 0.2 * Math.random() // 0-20% of the delay

  return delay + randomSum
}

/**
 * Builds a interceptor wrapper around an axios instance to automatically trigger http retries
 * @param axios The Axios Instance
 * @param opts The Retry config options
 */
export function axiosTrials (axios: AxiosInstance, opts: RetryConfig): void {
  axios.interceptors.request.use(config => {
    const currentState = getCurrentState(config)
    currentState.lastRequestTime = Date.now()

    return config
  })

  axios.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config

    // If we have no information to retry the request
    if (isEitherNilOrEmpty(config)) {
      return await Promise.reject(error)
    }

    const {
      retries = 3,
      retryCondition = isNetworkOrIdempotentRequestError,
      delayFn = () => 0,
      shouldResetTimeout = false
    } = getRequestOptions(config, opts)
    const currentState = getCurrentState(config)
    const shouldRetry = retryCondition(error) && currentState.retryCount < retries

    if (shouldRetry) {
      currentState.retryCount += 1
      const delay = delayFn(currentState.retryCount, error)

      // Axios fails merging this configuration to the default configuration because it has an issue
      // with circular structures: https://github.com/mzabriskie/axios/issues/370
      const fixedConfig = mergeAll([config, fixConfig(axios, config)])

      const numberExists = allPass([
        complement(isNil),
        complement(isNaN),
        complement(equals(0))
      ])

      if (!shouldResetTimeout && numberExists(fixedConfig.timeout) && numberExists(currentState.lastRequestTime)) {
        const lastRequestDuration = Date.now() - currentState.lastRequestTime
        // Minimum 1ms timeout (passing 0 or less to XHR means no timeout)
        fixedConfig.timeout = Math.max(fixedConfig.timeout ?? 1 - lastRequestDuration - delay, 1)
      }

      fixedConfig.transformRequest = [data => data]

      return new Promise(resolve => setTimeout(() => resolve(axios(fixedConfig)), delay))
    }

    return Promise.reject(error)
  })
}
