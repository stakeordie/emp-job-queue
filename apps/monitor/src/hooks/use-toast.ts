import { useState, useCallback } from 'react';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(({ title, description, variant = 'default' }: Omit<Toast, 'id'>) => {
    // For now, just log to console since we don't have a full toast implementation
    console.log(
      `[Toast] ${variant === 'destructive' ? '❌' : '✅'} ${title}${description ? ': ' + description : ''}`
    );

    // You could implement a full toast system here
    const id = Date.now().toString();
    const newToast: Toast = { id, title, description, variant };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return { toast, toasts };
}
