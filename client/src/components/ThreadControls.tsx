import React, { useState } from 'react';

interface ThreadControlsProps {
  currentThreadId: string | null;
  currentJobId: string | null;
  isProcessing: boolean;
  onNewThread: () => void;
  onStopJob: () => void;
  onResumeThread: (threadId: string) => void;
}

export const ThreadControls: React.FC<ThreadControlsProps> = ({
  currentThreadId,
  currentJobId,
  isProcessing,
  onNewThread,
  onStopJob,
  onResumeThread,
}) => {
  const [resumeThreadId, setResumeThreadId] = useState('');

  const handleResume = () => {
    if (resumeThreadId.trim()) {
      onResumeThread(resumeThreadId.trim());
      setResumeThreadId('');
    }
  };

  return (
    <div className="p-4 bg-white border-b space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-semibold">Thread ID:</span>{' '}
          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
            {currentThreadId || 'New session'}
          </span>
        </div>
        {currentJobId && (
          <div className="text-sm">
            <span className="font-semibold">Job ID:</span>{' '}
            <span className="font-mono text-xs bg-yellow-100 px-2 py-1 rounded">
              {currentJobId}
            </span>
          </div>
        )}
      </div>

      <div className="flex space-x-2">
        <button
          onClick={onNewThread}
          disabled={isProcessing}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          New Thread
        </button>

        {isProcessing && currentJobId && (
          <button
            onClick={onStopJob}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Stop
          </button>
        )}

        <div className="flex-1 flex space-x-2">
          <input
            type="text"
            value={resumeThreadId}
            onChange={(e) => setResumeThreadId(e.target.value)}
            placeholder="Enter thread ID to resume..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleResume}
            disabled={!resumeThreadId.trim() || isProcessing}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
};