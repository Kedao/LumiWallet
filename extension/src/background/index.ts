// Background service worker entry.
// TODO: wire messaging, wallet RPC, and agent requests.

chrome.runtime.onInstalled.addListener(() => {
  console.log('LumiWallet background ready')
})
