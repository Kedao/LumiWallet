// Inject minimal provider placeholder for DApp integration.

const provider = {
  isLumiWallet: true,
  request: async ({ method }: { method: string; params?: unknown[] }) => {
    console.debug('LumiWallet provider request', method)
    return Promise.resolve(null)
  },
  on: () => void 0,
  removeListener: () => void 0
}

Object.defineProperty(window, 'ethereum', {
  value: provider,
  writable: false
})
