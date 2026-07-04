import { handlers } from "@/auth";

// firebase-admin (the Firestore adapter) is Node-only.

export const { GET, POST } = handlers;
