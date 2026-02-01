'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProviders, useBudgetStatus } from '@/hooks/llm';
import { ProviderStatusCompact } from './ProviderStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

/**
 * Message types for the chat
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  success: boolean;
}

/**
 * Chat request/response types matching backend
 */
interface ChatRequest {
  message: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

interface ChatResponse {
  sessionId: string;
  message: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  suggestedActions?: string[];
}

/**
 * Message bubble component
 */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={cn(
        'flex w-full mb-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : isSystem
            ? 'bg-muted/50 text-muted-foreground text-sm italic'
            : 'bg-muted'
        )}
      >
        {/* Message Content */}
        <div className="whitespace-pre-wrap break-words">
          {message.isStreaming ? (
            <span className="inline-flex items-center gap-1">
              {message.content}
              <span className="animate-pulse">▊</span>
            </span>
          ) : (
            <MessageContent content={message.content} />
          )}
        </div>

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center gap-2 text-xs bg-background/50 rounded px-2 py-1"
              >
                <Badge variant="outline" className="text-[10px]">
                  {tool.name}
                </Badge>
                <span className="text-muted-foreground truncate">
                  {JSON.stringify(tool.arguments).slice(0, 50)}...
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tool Results */}
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolResults.map((result) => (
              <div
                key={result.toolCallId}
                className={cn(
                  'text-xs rounded px-2 py-1',
                  result.success
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                )}
              >
                {result.name}: {result.success ? 'Success' : 'Failed'}
              </div>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={cn(
            'text-[10px] mt-1',
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

/**
 * Message content with code highlighting
 */
function MessageContent({ content }: { content: string }) {
  // Ensure content is a string - handle cases where API returns unexpected format
  const textContent = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? (content as any[]).filter((b: any) => b?.type === 'text').map((b: any) => b?.text || '').join('')
      : String(content || '');

  // Simple code block detection and rendering
  const parts = textContent.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          // Extract language and code
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          if (match) {
            const [, lang, code] = match;
            return (
              <pre
                key={i}
                className="mt-2 mb-2 p-2 bg-background/80 rounded text-xs overflow-x-auto"
              >
                {lang && (
                  <div className="text-[10px] text-muted-foreground mb-1">
                    {lang}
                  </div>
                )}
                <code>{code.trim()}</code>
              </pre>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * Typing indicator
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 text-muted-foreground px-4 py-2">
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

/**
 * Suggested actions component
 */
function SuggestedActions({
  actions,
  onSelect,
}: {
  actions: string[];
  onSelect: (action: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {actions.map((action, i) => (
        <Button
          key={i}
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => onSelect(action)}
        >
          {action}
        </Button>
      ))}
    </div>
  );
}

interface AgentChatProps {
  className?: string;
  defaultOpen?: boolean;
}

/**
 * AgentChat - Conversational interface for Pact agents
 *
 * Features:
 * - Natural language interaction with agents
 * - Tool/function calling visualization
 * - Code syntax highlighting
 * - Suggested actions
 * - Session persistence
 */
export function AgentChat({ className, defaultOpen = false }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'Hi! I can help you with Pact tasks. Try asking me to:\n• "Analyze this intent: Users can log in with email"\n• "Show me atoms related to authentication"\n• "Improve the quality of IA-001"',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: providers } = useProviders();
  const { isDailyBudgetExceeded } = useBudgetStatus();

  const hasAvailableProvider = providers?.availableCount ? providers.availableCount > 0 : false;
  const canChat = hasAvailableProvider && !isDailyBudgetExceeded;

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (request: ChatRequest) => {
      const response = await apiClient.post<ChatResponse>(
        '/agents/chat',
        request
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Update session ID
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      // Add assistant message
      // Ensure message is always a string (handle edge cases where LLM returns array content)
      const messageContent = typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? (data.message as any[]).filter((b: any) => b?.type === 'text').map((b: any) => b?.text || '').join('')
          : String(data.message || 'No response received');

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: messageContent,
        timestamp: new Date(),
        toolCalls: data.toolCalls,
        toolResults: data.toolResults,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Update suggested actions
      if (data.suggestedActions) {
        setSuggestedActions(data.suggestedActions);
      }
    },
    onError: (error: Error) => {
      toast.error(`Chat failed: ${error.message}`);
      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error.message}`,
          timestamp: new Date(),
        },
      ]);
    },
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = useCallback(() => {
    if (!input.trim() || !canChat || chatMutation.isPending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setSuggestedActions([]);
    setInput('');

    chatMutation.mutate({
      message: input.trim(),
      sessionId,
    });
  }, [input, canChat, chatMutation, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedAction = (action: string) => {
    setInput(action);
    inputRef.current?.focus();
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content:
          'Chat cleared. How can I help you with Pact today?',
        timestamp: new Date(),
      },
    ]);
    setSessionId(undefined);
    setSuggestedActions([]);
  };

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="p-3 pb-2 border-b flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">Pact Assistant</CardTitle>
          {sessionId && (
            <Badge variant="outline" className="text-[10px]">
              Session active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProviderStatusCompact />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleClearChat}
          >
            Clear
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {chatMutation.isPending && <TypingIndicator />}
        </ScrollArea>

        {/* Suggested Actions */}
        {suggestedActions.length > 0 && !chatMutation.isPending && (
          <SuggestedActions
            actions={suggestedActions}
            onSelect={handleSuggestedAction}
          />
        )}

        {/* Input */}
        <div className="p-3 border-t">
          {!canChat && (
            <div className="text-xs text-muted-foreground mb-2">
              {!hasAvailableProvider
                ? 'No LLM providers available'
                : 'Daily budget exceeded'}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={canChat ? 'Ask me anything about Pact...' : 'Chat unavailable'}
              disabled={!canChat || chatMutation.isPending}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || !canChat || chatMutation.isPending}
              size="icon"
            >
              <SendIcon />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Send icon
 */
function SendIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

/**
 * Chat button that opens the chat in a sheet
 */
export function AgentChatButton({ className }: { className?: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn('rounded-full w-12 h-12 shadow-lg', className)}
        >
          <ChatIcon />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[450px] p-0 flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>Pact Assistant</SheetTitle>
        </SheetHeader>
        <AgentChat className="flex-1 border-0 rounded-none" />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Chat icon
 */
function ChatIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
