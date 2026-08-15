import { useCallback, useState } from 'react';
import type { AiMessage } from './aiTypes';

const messageId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useAiConversation() {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');

  const appendUser = useCallback((content: string) => {
    const message: AiMessage = {
      id: messageId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((current) => [...current, message]);
    return message.id;
  }, []);

  const appendAssistant = useCallback(() => {
    const message: AiMessage = {
      id: messageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages((current) => [...current, message]);
    return message.id;
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, content } : message
    )));
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  return {
    messages,
    input,
    setInput,
    appendUser,
    appendAssistant,
    updateMessage,
    clear,
  };
}
