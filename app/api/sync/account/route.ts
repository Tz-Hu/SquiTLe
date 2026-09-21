import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { signedIn: false },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { signedIn: true, email: user.email, displayName: user.displayName },
    { headers: { "cache-control": "no-store" } },
  );
}
