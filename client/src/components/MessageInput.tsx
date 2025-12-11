import React, { useState, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  isProcessing,
  disabled = false,
}) => {
  const [message, setMessage] = useState('');

  const isInputDisabled = isProcessing || disabled;

  const handleSend = () => {
    if (message.trim() && !isInputDisabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 surface-alt border-t border-brand">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
        disabled={isInputDisabled}
        className="brand-input resize-none min-h-[96px]"
        rows={4}
      />
      <div className="flex items-center justify-end">
        <button
          onClick={handleSend}
          disabled={!message.trim() || isInputDisabled}
          className="btn btn-primary"
        >
          {isProcessing ? 'Processing' : disabled ? 'Loading' : 'Send'}
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};
