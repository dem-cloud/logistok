import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split(' ')[1];
        
        if (!token) {
            return NextResponse.json({ success: false, message: "Missing token" }, { status: 400 });
        }

        const body = await req.json();  // Get the rest of the body content

        // Forward request to Express backend
        const backendResponse = await fetch(`${BASE_URL}/api/shared/create-new-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,  // Send the token in the Authorization header
            },
            body: JSON.stringify(body), // Forward entire request body to backend
        });

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });
    } catch (error) {
        console.error("Error resetting password:", error);
        return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }
}
