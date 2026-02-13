import { NextResponse } from "next/server";
import { DEFAULT_TENDER_CONFIG } from "@/features/tender-ui/default-config";

export async function GET() {
  return NextResponse.json(DEFAULT_TENDER_CONFIG);
}
