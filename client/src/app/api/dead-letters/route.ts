import { NextResponse } from 'next/server';

import { backendFetchJson, backendUnreachableResponse } from '@/lib/backend';

export async function GET(request: Request): Promise<NextResponse> {
  const incoming = new URL(request.url).searchParams;
  const page = incoming.get('page') ?? '1';
  const pageSize = incoming.get('pageSize') ?? '50';
  try {
    const result = await backendFetchJson(
      `/v1/dead-letters?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`,
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return backendUnreachableResponse();
  }
}
