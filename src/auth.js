export const STAFF_SESSION_KEY = 'bcStaffToken'

const LOCAL_STAFF_PASSWORD_RECORD =
  'pbkdf2-sha256$210000$AcRtVkLLLJE8C6bD6FRgaw==$CTxYYz9Ku7Gcg5DCj65UwKum8wblzo+uPz3/W4YEw8s='

function decodeBase64(value) {
  return Uint8Array.from(globalThis.atob(value), (character) =>
    character.charCodeAt(0),
  )
}

function equalBytes(left, right) {
  if (left.length !== right.length) {
    return false
  }

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }

  return difference === 0
}

export async function verifyPasswordRecord(password, record) {
  const [algorithm, iterationsValue, saltValue, hashValue] = String(record).split('$')
  const iterations = Number(iterationsValue)

  if (
    algorithm !== 'pbkdf2-sha256' ||
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    !saltValue ||
    !hashValue
  ) {
    return false
  }

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const expectedHash = decodeBase64(hashValue)
  const actualHash = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: decodeBase64(saltValue),
        iterations,
      },
      key,
      expectedHash.length * 8,
    ),
  )

  return equalBytes(actualHash, expectedHash)
}

export function verifyLocalStaffPassword(password) {
  return verifyPasswordRecord(password, LOCAL_STAFF_PASSWORD_RECORD)
}

export function getStaffToken() {
  return globalThis.sessionStorage?.getItem(STAFF_SESSION_KEY) || ''
}

export function storeStaffToken(token) {
  globalThis.sessionStorage?.setItem(STAFF_SESSION_KEY, token)
}

export function clearStaffToken() {
  globalThis.sessionStorage?.removeItem(STAFF_SESSION_KEY)
}
