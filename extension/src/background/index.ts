// Background service worker entry.
// TODO: wire messaging, wallet RPC, and agent requests.

chrome.runtime.onInstalled.addListener(() => {
  console.log('LumiWallet background ready')
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: any) => {
      console.warn('Failed to set panel behavior', error)
    })
  }
})
