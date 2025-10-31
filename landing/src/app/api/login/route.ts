// app/api/login/route.ts
import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export async function POST(req: Request) {
    try {
        // Read the body from the incoming request
        const requestBody = await req.json();

        // Forward the request to the Express server
        const expressResponse = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            credentials: 'include',
        });

        // If the Express server responds successfully
        if (expressResponse.ok) {
            const expressData = await expressResponse.json();

            const response = NextResponse.json({ 
                success: expressData.success, 
                message: expressData.message 
            });

            // Forward the set-cookie header from Express to Next.js response
            const setCookieHeader = expressResponse.headers.get('set-cookie');
            if (setCookieHeader) {
                response.headers.set('set-cookie', setCookieHeader);
            }

            return response;
        }

        // If the Express server returns an error
        const expressError = await expressResponse.json();
        return NextResponse.json(expressError, { status: 500 });

    } catch (error) {
        console.error('Error in Next.js proxy route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
