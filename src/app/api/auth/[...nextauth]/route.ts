import { handlers } from "@/auth";

// firebase-admin (the Firestore adapter) is Node-only.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
