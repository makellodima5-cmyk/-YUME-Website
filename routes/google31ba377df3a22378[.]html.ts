import { createFileRoute } from "@tanstack/react-router";

const verificationBody = "google-site-verification: google31ba377df3a22378.html";

export const Route = createFileRoute("/google31ba377df3a22378[.]html")({
  server: {
    handlers: {
      GET: async () => new Response(verificationBody, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }),
      HEAD: async () => new Response(null, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }),
    },
  },
});
