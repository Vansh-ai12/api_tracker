// Keep the legacy webhook URL working while centralizing all bot updates in
// the handler that supports secure dashboard-to-Telegram account linking.
export { POST } from "../telegram-webhook/route";
