-- Channel-side order status (Rozetka today). Worker writes the latest
-- status name + id on every status-change event so the chat header can
-- render a status chip without the web walking Message.metadata.
ALTER TABLE "Conversation"
  ADD COLUMN "contextStatusId"   TEXT,
  ADD COLUMN "contextStatusName" TEXT;
