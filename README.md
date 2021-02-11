# Axios Trials

A basic module/set of code that can be used to automatically wrap axios in a retry loop.

## Where do I put it

Well, since this isn't really hosted anywhere you probably got a Zip file from me, Dustin!

What I suggest you do is create a folder in the "lib" folder on your TaskRunner, call this folder whatever you want, but for this example I'll just call it `axios-trials`

Once you've created this file, simply unzip the contents of `axios-trials` into the folder you created. Great now you can import it into your TR and start retrying your axios calls!

## How To

Using axios trials is pretty ezpz.

> Important Note: You should **always** create an axios instance and pass that in to `axios-trials` this keeps axios itself pure, see examples below

```ts
import axios from 'axios'
import { axiosTrials } from './wherever/you/unzipped'

const myAxios = axios.create()

axiosTrials(myAxios, { retries: 4 })

myAxios.get('http://supercool.com')
```

And you're done, great now go ahead and start retrying.

If you want to use the built in delay function you can, here's how:

```ts
import axios from 'axios'
import { axiosTrials, exponentialDelay } from './wherever/you/unzipped'

const myAxios = axios.create()

axiosTrials(myAxios, { retries: 4, delayFn: exponentialDelay })

myAxios.get('http://supercool.com')
```

## Options

So! Axios Trial takes in some options to set things straight, here they are!

- `retries`: `number` - The number of retries to attempt (DEFAULT: `3`)
- `retryCondition`: `function` - The function to run on retry must return a boolean (DEFAULT: `isNetworkOrIdempotentRequestError`)
- `delayFn`: `function` - The delay function that returns how long to delay each request (DEFAULT: `noDelay`)
  - You can pass `exponentialDelay` here if you want a 0 - 20% delay base
- `shouldResetTimeout`: `boolean` - Should the timeout reset each attempt (DEFAULT: `false`)

## Future Plans

I really want to change the way this module runs, because I don't like the underlining mutation affects axios instances, It seems though when I try to create the instance myself the module suddenly starts failing.

I can't seem to get that 100% yet but keep a look out for a future change!
