import React from 'react';
import { Agent } from '../api';

interface AgentSelectorProps {
  agents: Agent[];
  selectedAgent: string;
  onAgentChange: (agentType: string) => void;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  selectedAgent,
  onAgentChange,
}) => {
  return (
    <div className="panel p-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="font-semibold text-brand-muted">Select Agent</label>
      <select
        value={selectedAgent}
        onChange={(e) => onAgentChange(e.target.value)}
        className="brand-input flex-1"
      >
        {agents.map((agent) => (
          <option key={agent.type} value={agent.type}>
            {agent.name} {agent.model ? `(${agent.model})` : ''}
            {agent.hasMcpServers ? ' - MCP' : ''}
          </option>
        ))}
      </select>
    </div>
  );
};
