import nock from 'nock'
import axios, { AxiosInstance } from 'axios'
import test from 'tape'
import {
  axiosTrials
} from '../index'

/* eslint-disable */

const NETWORK_ERROR: any = new Error('Some connection error')
NETWORK_ERROR.code = 'ECONNRESET'

function setupResponses (client: AxiosInstance, responses) {
  const configureResponse = (): any => {
    const response = responses.shift()
    if (response) {
      response()
    }
  }
  client.interceptors.response.use(
    result => {
      configureResponse()

      return result
    },
    async error => {
      configureResponse()

      return await Promise.reject(error)
    }
  )
  configureResponse()
}

test('axiosTrials(axios, { retries, retryCondition })', t => {
  const client = axios.create();
  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .reply(200, 'It worked!')
  ])

  axiosTrials(client, { retries: 0 })

  client.get('http://example.com/test').then(result => {
    t.same(200, result.status)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})

test('When the response is an error', t => {
  const client = axios.create();
  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .reply(200, 'It worked!')
  ])

  const retryCondition = error => {
    t.same(error, NETWORK_ERROR)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()

    return false;
  }

  axiosTrials(client, { retries: 1, retryCondition })
  client.get('http://example.com/test').catch(() => { })
})

test('When it satisfies the retry condition', t => {
  const client = axios.create()
  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .reply(200, 'It worked!')
  ])
  axiosTrials(client, { retries: 1, retryCondition: () => true })

  client.get('http://example.com/test').then(result => {
    t.same(result.status, 200)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})

test('should not run transformRequest twice', t => {
  const client = axios.create({
    transformRequest: [JSON.stringify]
  })
  setupResponses(client, [
    () =>
      nock('http://example.com')
        .post('/test', body => {
          t.same(body.a, 'b')
          return true;
        })
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .post('/test', body => {
          t.same(body.a, 'b')
          return true;
        })
        .reply(200, 'It worked!')
  ])

  axiosTrials(client, { retries: 3, retryCondition: () => true })

  client.post('http://example.com/test', { a: 'b' }).then(result => {
    t.same(result.status, 200)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})
