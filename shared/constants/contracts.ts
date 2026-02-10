/**
 * Contract addresses will be updated after deployment
 */

export const CONTRACTS = {
  // Test contracts for vulnerability testing
  VULNERABLE_TOKEN: '',
  PHISHING_CONTRACT: '',
  
  // DEX contracts
  UNISWAP_ROUTER: '',
  ONEINCH_ROUTER: '',
} as const

export type ContractName = keyof typeof CONTRACTS
