# Chat Viewer

A browser-based viewer for exported WhatsApp conversations. It supports `.txt` and `.zip` chat exports, participant filtering, themes, and media previews.

Chat files are processed in the browser. The app does not upload chat content to a server; browser storage is used for local state.

## Run locally

```bash
git clone https://github.com/ipvesp/chat-viewer.git
cd chat-viewer
npm install
npm run dev
```

Open the local URL shown by Next.js and select an exported chat file. Run `npm run build` to verify a production build.
