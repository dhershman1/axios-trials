import nock from 'nock'
import axios, { AxiosInstance } from 'axios'
import test from 'tape'
import {
  axiosTrials
} from '../index'

/* eslint-disable */

const NETWORK_ERROR: any = new Error('Some connection error')
NETWORK_ERROR.code = 'ECONNRESET'

function setupResponses (client: AxiosInstance, responses: any) {
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

  const retryCondition = (error: any) => {
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

test('should reject with a request error if retries <= 0', t => {
  const client = axios.create()

  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR)
  ])

  axiosTrials(client, { retries: 0, retryCondition: () => true })

  client.get('http://example.com/test').catch(error => {
    t.same(error, NETWORK_ERROR)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})

test('should reject with a request error if there are more errors than retries', t => {
  const client = axios.create()

  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(new Error('foo error')),
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR)
  ])

  axiosTrials(client, { retries: 1, retryCondition: () => true })

  client.get('http://example.com/test').catch(error => {
    t.same(error, NETWORK_ERROR)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  });
})

test('should honor the original `timeout` across retries', t => {
  const client = axios.create()

  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .delay(75)
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .delay(75)
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .reply(200)
  ])

  axiosTrials(client, { retries: 3 })

  client.get('http://example.com/test', { timeout: 100 })
    .catch(error => {
      t.same(error.code, 'ECONNABORTED')
      nock.cleanAll()
      nock.enableNetConnect()
      t.end()
    })
})

test('should reset the original `timeout` between requests', t => {
  const client = axios.create()

  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .delay(75)
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .delay(75)
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .reply(200)
  ])

  axiosTrials(client, { retries: 3, shouldResetTimeout: true })

  client.get('http://example.com/test', { timeout: 100 }).then(result => {
    t.same(result.status, 200)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})

test('should reject with errors without a `config` property without retrying', t => {
  const client = axios.create()

  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .reply(200)
  ])

  // Force returning a plain error without extended information from Axios
  const generatedError = new Error()
  client.interceptors.response.use(undefined, () => Promise.reject(generatedError))

  axiosTrials(client, { retries: 1, retryCondition: () => true })

  client.get('http://example.com/test').catch(error => {
    t.same(error, generatedError)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})

test('when it does NOT satisfy the retry condition', t => {
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
  ]);

  axiosTrials(client, { retries: 1, retryCondition: () => false })

  client.get('http://example.com/test').catch(error => {
    t.same(error, NETWORK_ERROR)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})

test('With custom retry it should execute for each retry', t => {
  const client = axios.create();

  setupResponses(client, [
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .replyWithError(NETWORK_ERROR),
    () =>
      nock('http://example.com')
        .get('/test')
        .reply(200, 'It worked!')
  ]);

  let retryCount = 0;

  axiosTrials(client, {
    retries: 4,
    retryCondition: () => true,
    delayFn: () => {
      retryCount += 1;
      return 0;
    }
  });

  client.get('http://example.com/test').then(() => {
    t.same(retryCount, 3)
    nock.cleanAll()
    nock.enableNetConnect()
    t.end()
  })
})
