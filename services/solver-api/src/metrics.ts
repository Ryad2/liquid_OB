interface Counter {
  count: number
  durationSeconds: number
}

export class HttpMetrics {
  readonly #startedAt = Date.now()
  readonly #requests = new Map<string, Counter>()

  observe(method: string, route: string, statusCode: number, durationSeconds: number): void {
    const normalizedRoute = route === '' ? 'unknown' : route
    const key = JSON.stringify([method, normalizedRoute, String(statusCode)])
    const current = this.#requests.get(key) ?? { count: 0, durationSeconds: 0 }
    current.count += 1
    current.durationSeconds += durationSeconds
    this.#requests.set(key, current)
  }

  render(): string {
    const lines = [
      '# HELP liquid_ob_api_uptime_seconds Process uptime in seconds.',
      '# TYPE liquid_ob_api_uptime_seconds gauge',
      `liquid_ob_api_uptime_seconds ${((Date.now() - this.#startedAt) / 1_000).toFixed(3)}`,
      '# HELP liquid_ob_api_resident_memory_bytes Resident process memory.',
      '# TYPE liquid_ob_api_resident_memory_bytes gauge',
      `liquid_ob_api_resident_memory_bytes ${process.memoryUsage().rss}`,
      '# HELP liquid_ob_api_http_requests_total Completed HTTP requests.',
      '# TYPE liquid_ob_api_http_requests_total counter',
    ]
    const entries = [...this.#requests.entries()].sort(([left], [right]) => left.localeCompare(right))
    for (const [key, value] of entries) {
      const [method, route, status] = JSON.parse(key) as [string, string, string]
      const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"`
      lines.push(`liquid_ob_api_http_requests_total{${labels}} ${value.count}`)
    }
    lines.push(
      '# HELP liquid_ob_api_http_request_duration_seconds_sum Aggregate HTTP request duration.',
      '# TYPE liquid_ob_api_http_request_duration_seconds_sum counter',
    )
    for (const [key, value] of entries) {
      const [method, route, status] = JSON.parse(key) as [string, string, string]
      const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"`
      lines.push(`liquid_ob_api_http_request_duration_seconds_sum{${labels}} ${value.durationSeconds.toFixed(6)}`)
    }
    return `${lines.join('\n')}\n`
  }
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
}
