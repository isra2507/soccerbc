import { pbkdf2Sync, randomBytes } from 'node:crypto'

function readHiddenPassword(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Run this command in an interactive terminal.'))
      return
    }

    let password = ''
    const wasRaw = process.stdin.isRaw

    const finish = () => {
      process.stdin.off('data', onData)
      process.stdin.setRawMode(wasRaw)
      process.stdin.pause()
      process.stdout.write('\n')
    }

    const onData = (input) => {
      for (const character of input) {
        if (character === '\u0003') {
          finish()
          reject(new Error('Password generation cancelled.'))
          return
        }

        if (character === '\r' || character === '\n') {
          finish()
          resolve(password)
          return
        }

        if (character === '\u007f' || character === '\b') {
          password = password.slice(0, -1)
        } else if (character >= ' ') {
          password += character
        }
      }
    }

    process.stdout.write(prompt)
    process.stdin.setRawMode(true)
    process.stdin.setEncoding('utf8')
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}

const password = await readHiddenPassword('New staff password: ')

if (password.length < 12) {
  throw new Error('Use a staff password with at least 12 characters.')
}

const iterations = 210000
const salt = randomBytes(16)
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256')

console.log(
  `pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`,
)
