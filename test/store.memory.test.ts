import { MemoryStore } from './helpers/memoryStore.ts'
import { storeContract } from './store.contract.ts'

storeContract('MemoryStore', () => new MemoryStore())
