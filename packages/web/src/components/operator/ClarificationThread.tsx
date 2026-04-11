import { InputArea } from '../session/InputArea'

// ── Types ────────────────────────────────────────────────────────────────────

interface ClarificationThreadProps {
  requestId: string
  questions: Array<{ question: string; answer?: string }>
  isWaitingForAnswer: boolean
  onAnswer: (answer: string) => void
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Conversational Q&A flow in the chat thread (D-01).
 * Renders clarification questions as assistant-style bubbles and answers as
 * user-style text. Shows InputArea when waiting for operator's answer.
 */
export function ClarificationThread({
  requestId: _requestId,
  questions,
  isWaitingForAnswer,
  onAnswer,
}: ClarificationThreadProps) {
  const lastQuestion = questions[questions.length - 1]
  const needsAnswer = isWaitingForAnswer && lastQuestion && !lastQuestion.answer

  return (
    <div className="space-y-md">
      {/* Intro message */}
      <div className="bg-surface rounded-lg p-4 animate-[fadeIn_250ms_ease-out_both]">
        <p className="font-body text-[15px] text-text-primary">
          Before we begin, I have a few questions to make sure we get this right.
        </p>
      </div>

      {/* Q&A pairs */}
      {questions.map((qa, idx) => (
        <div key={idx} className="space-y-md">
          {/* Question (assistant-style bubble) */}
          <div className="bg-surface rounded-lg p-4 animate-[fadeIn_250ms_ease-out_both]">
            <p className="font-body text-[15px] text-text-primary">
              {qa.question}
            </p>
          </div>

          {/* Answer (user-style, no background) */}
          {qa.answer && (
            <div>
              <p className="font-body text-[15px] text-text-primary">
                {qa.answer}
              </p>
            </div>
          )}
        </div>
      ))}

      {/* Input area when waiting for answer */}
      {needsAnswer && (
        <div className="mt-md">
          <InputArea
            onSend={onAnswer}
            isStreaming={false}
            placeholder="Type your answer..."
          />
        </div>
      )}
    </div>
  )
}
