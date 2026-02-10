import { AgentRiskInput, AgentRiskOutput } from '../types/models'

export const analyzeRisk = async (payload: AgentRiskInput): Promise<AgentRiskOutput> => {
  // TODO: wire to Agent API once schema is finalized.
  void payload
  return {
    level: 'low',
    type: 'placeholder',
    evidence: ['Awaiting agent integration'],
    suggestion: 'Review destination and contract carefully.'
  }
}
