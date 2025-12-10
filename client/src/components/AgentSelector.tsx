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
    <div className="flex items-center space-x-4 p-4 bg-gray-100 rounded-lg">
      <label className="font-semibold text-gray-700">Select Agent:</label>
      <select
        value={selectedAgent}
        onChange={(e) => onAgentChange(e.target.value)}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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