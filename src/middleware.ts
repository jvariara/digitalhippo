import { NextRequest, NextResponse } from "next/server";
import { getServerSideUser } from "./lib/payload-utils";

export async function middleware(req: NextRequest) {
  // if user is logged in, they shouldnt access sign up and sign in pages
  const { nextUrl, cookies } = req;
  const { user } = await getServerSideUser(cookies);

  if (user && ["/sign-in", "/sign-up"].includes(nextUrl.pathname)) {
    // they shouldnt be able to access these pages, so redirect them
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SERVER_URL}/`);
  }

  // everything is okay, so perform next action
  return NextResponse.next()
}
