

export function generateSixDigitCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}