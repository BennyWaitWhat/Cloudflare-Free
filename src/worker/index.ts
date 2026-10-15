import { app } from "./app";
import type { Bindings, JobMessage } from "./env";
import { handleEmail, handleQueue, handleScheduled } from "./handlers";

export { ChatRoom } from "./durable/chat-room";
export { ModeratePostWorkflow } from "./workflows/moderate-post";

export default {
  fetch: app.fetch,
  queue: handleQueue,
  scheduled: handleScheduled,
  email: handleEmail,
} satisfies ExportedHandler<Bindings, JobMessage>;
