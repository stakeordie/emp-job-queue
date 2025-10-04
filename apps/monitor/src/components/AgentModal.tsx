'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, Send, Lightbulb, Loader2 } from 'lucide-react';
import { prepareAgentContext, askAgent, getSuggestedQuestions, type AgentContext, type AgentResponse } from '@/lib/agent-utils';
import type { QueryResult, AnalysisResult } from '@/app/workflow-debug/page';

interface AgentModalProps {
  workflowId: string;
  queryResults: QueryResult[];
  analysis?: AnalysisResult;
  triggerButton?: React.ReactNode;
}

interface Message {
  role: 'user' | 'agent';
  content: string;
  confidence?: 'high' | 'medium' | 'low';
  suggestedActions?: string[];
  timestamp: Date;
}

export default function AgentModal({ workflowId, queryResults, analysis, triggerButton }: AgentModalProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Prepare context for agent
  const agentContext: AgentContext = prepareAgentContext(workflowId, queryResults, analysis);
  const suggestedQuestions = getSuggestedQuestions(agentContext);

  const handleAsk = async (questionText?: string) => {
    const q = questionText || question;
    if (!q.trim()) return;

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: q,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setQuestion('');
    setLoading(true);

    try {
      const response: AgentResponse = await askAgent({
        question: q,
        context: agentContext
      });

      // Add agent response
      const agentMessage: Message = {
        role: 'agent',
        content: response.answer,
        confidence: response.confidence,
        suggestedActions: response.suggestedActions,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      // Add error message
      const errorMessage: Message = {
        role: 'agent',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 'low',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestedQuestion = (suggested: string) => {
    setQuestion(suggested);
    handleAsk(suggested);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="outline" size="sm">
            <MessageCircle className="w-4 h-4 mr-2" />
            Ask AI Agent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Workflow AI Agent
          </DialogTitle>
          <DialogDescription>
            Ask questions about workflow {workflowId}. The AI has access to all query results and analysis.
          </DialogDescription>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No messages yet. Ask a question or use a suggested question below.</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <Card className={`max-w-[80%] ${msg.role === 'user' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2 mb-1">
                    <span className="font-semibold text-sm">
                      {msg.role === 'user' ? 'You' : 'AI Agent'}
                    </span>
                    {msg.confidence && (
                      <Badge
                        variant={msg.confidence === 'high' ? 'default' : msg.confidence === 'medium' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        {msg.confidence} confidence
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-semibold text-gray-700 mb-2">Suggested Actions:</p>
                      <ul className="text-xs space-y-1">
                        {msg.suggestedActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-blue-600">•</span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-2">{msg.timestamp.toLocaleTimeString()}</p>
                </CardContent>
              </Card>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <Card className="max-w-[80%] bg-gray-50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-gray-600">AI is thinking...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Suggested Questions */}
        {messages.length === 0 && (
          <div className="border-t pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-semibold">Suggested Questions:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((suggested, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuggestedQuestion(suggested)}
                  disabled={loading}
                  className="text-xs"
                >
                  {suggested}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t pt-3">
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleAsk()}
              placeholder="Ask a question about this workflow..."
              disabled={loading}
            />
            <Button onClick={() => handleAsk()} disabled={loading || !question.trim()}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
