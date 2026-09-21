import { redirect } from "next/navigation";
import { chatGPTSignOutPath } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default function SyncSignOutPage() {
  redirect(chatGPTSignOutPath("/"));
}
