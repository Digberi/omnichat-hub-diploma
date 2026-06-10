import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base"
import type { LogRecord, LogRecordProcessor } from "@opentelemetry/sdk-logs"

export class InMemorySpanProcessor implements SpanProcessor {
  public readonly spans: ReadableSpan[] = []

  onStart(): void {}
  onEnd(span: ReadableSpan): void {
    this.spans.push(span)
  }
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}

  reset(): void {
    this.spans.length = 0
  }
}

export class InMemoryLogProcessor implements LogRecordProcessor {
  public readonly records: LogRecord[] = []

  onEmit(record: LogRecord): void {
    this.records.push(record)
  }
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}

  reset(): void {
    this.records.length = 0
  }
}
