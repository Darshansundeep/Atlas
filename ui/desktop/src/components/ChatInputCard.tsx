import React from 'react';
import { cn } from '../utils';

/**
 * Shared visual wrapper for the ChatInput.
 *
 * Both the Hub (empty-chat landing) and the BaseChat (active session)
 * present ChatInput as a floating rounded outlined card on the canvas.
 * Centralizing it here keeps the look in sync and gives a single place
 * to tweak the recipe.
 */
export const ChatInputCard: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => (
  <div
    className={cn(
      'rounded-2xl border border-border-primary overflow-hidden bg-background-primary',
      'transition-shadow focus-within:ring-2',
      className
    )}
    style={{
      boxShadow: 'var(--shadow-md)',
      // Focus ring uses the brand cobalt; the actual ring color is set by the
      // Tailwind ring-* utilities through CSS var, but we keep an inline fallback.
    }}
  >
    {children}
  </div>
);
