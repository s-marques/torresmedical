import { useApiHealth, type ApiHealthStatus } from './use-api-health';

const STATUS_LABEL: Record<ApiHealthStatus, string> = {
  checking: 'verificando…',
  online: 'online',
  offline: 'indisponível',
};

export function App() {
  const apiStatus = useApiHealth();

  return (
    <main>
      <h1>Torres Medical</h1>
      <p>
        API: <span data-testid="api-status">{STATUS_LABEL[apiStatus]}</span>
      </p>
    </main>
  );
}
