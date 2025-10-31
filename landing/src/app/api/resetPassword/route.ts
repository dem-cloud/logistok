import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get("token");

        if (!token) {
            return NextResponse.json({ success: false, message: "Missing token" }, { status: 400 });
        }

        // Forward request to Express backend
        const backendResponse = await fetch(`${BASE_URL}/api/shared/reset-password`, { //?token=${token}
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,  // Send the token in the Authorization header
            },
        });

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });
    } catch (error) {
        console.error("Error verifying account:", error);
        return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }
}
