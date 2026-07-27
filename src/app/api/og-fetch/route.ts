import { NextResponse } from "next/server";
import { fetchOpenGraph } from "@/lib/opengraph";
import { isValidUrl } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || !isValidUrl(url)) {
      return NextResponse.json(
        { error: "Ungültige URL" },
        { status: 400 }
      );
    }

    const data = await fetchOpenGraph(url);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        title: null,
        description: null,
        image: null,
        provider: null,
        error: "Daten konnten nicht geladen werden",
      },
      { status: 200 }
    );
  }
}
