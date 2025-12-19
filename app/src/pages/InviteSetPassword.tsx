import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";
import { axiosPrivate, axiosPublic } from "../api/axios";
import Button from "../components/reusable/Button";
import Input from "../components/reusable/Input";
import { useAuth } from "@/context/AuthContext";
type Invite = {
    email: string;
    company: {
        name: string
    };
    role: {
        name: string;
    };
}
export default function InviteSetPassword() {
    const { token } = useParams();
    const navigate = useNavigate();

    const { user, logout } = useAuth();

    const [loading, setLoading] = useState(true);
    const [invite, setInvite] = useState<Invite | null>(null);
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // 1️⃣ LOAD INVITE INFO
    useEffect(() => {
        const load = async () => {
            try {
                const res = await axiosPublic.get(`/api/shared/invite/${token}`);
                setInvite(res.data.data);
            } catch (err) {
                console.error(err);
                setInvite(null);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    if (loading) return <Spinner />;

    if (!invite) {
        return (
            <div className="center-page">
                <h2>Η πρόσκληση δεν είναι διαθέσιμη.</h2>
                <p>Το link μπορεί να έχει λήξει ή να μην είναι έγκυρο.</p>
            </div>
        );
    }

    const invitedEmail = invite.email;
    const company = invite.company;
    const role = invite.role;

    // 2️⃣ USER IS LOGGED IN BUT WITH DIFFERENT EMAIL
    if (true && user?.email !== invitedEmail) {//isLoggedIn
        return (
            <div className="center-page">
                <h2>Δεν έχετε πρόσβαση σε αυτή την πρόσκληση</h2>
                <p>Η πρόσκληση αφορά το email <b>{invitedEmail}</b></p>

                <Button onClick={() => logout()}>
                    Αποσύνδεση και συνέχεια
                </Button>
            </div>
        );
    }

    // 3️⃣ USER HAS ACCOUNT? → Backend tells us:
    // invite.existing_user === true | false (αν θες να το προσθέσουμε)
    // αλλά μπορούμε να το δούμε στο frontend:
    const existingUser = true//isLoggedIn; // απλοποιημένο & σωστό

    // 4️⃣ HANDLE ACCEPT INVITATION
    const handleAccept = async () => {
        setSubmitting(true);
        setError("");

        try {
            const res = await axiosPrivate.post("/api/invite/accept", {
                token,
                // password optional (backend το αγνοεί όταν ο χρήστης ήδη υπάρχει)
                password: existingUser ? undefined : password
            });

            const { success, data } = res.data;
            if (!success) {
                setError("Παρουσιάστηκε σφάλμα");
                return;
            }

            const accessToken = data.access_token;

            // 🔥 Κάνε login με το token που δίνει το backend
            // await loginAfterInvite(accessToken);

            // Μετά → select-company flow
            navigate("/select-company", { replace: true });

        } catch (err) {
            console.error(err);
            setError("Κάτι πήγε στραβά. Προσπαθήστε ξανά.");
        } finally {
            setSubmitting(false);
        }
    };

    // 5️⃣ USER DOES NOT HAVE ACCOUNT → Show password creation form
    if (!existingUser) {
        return (
            <div className="center-page auth-card">

                <img
                    src="/robot.png"
                    alt="Robot"
                    style={{ width: 70, marginBottom: 20 }}
                />

                <h2>Καταχώρηση Κωδικού Πρόσβασης</h2>
                <p>Διάλεξε τον κωδικό πρόσβασης για το λογαριασμό σου.</p>

                <Input
                    label="Κωδικός Πρόσβασης"
                    name=""
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                <Input
                    label="Επανάληψη Κωδικού"
                    name=""
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                />

                {error && <p className="error-text">{error}</p>}

                <Button
                    loading={submitting}
                    disabled={password.length < 6 || password !== password2}
                    onClick={handleAccept}
                >
                    Καταχώρηση Κωδικού
                </Button>
            </div>
        );
    }

    // 6️⃣ USER LOGGED-IN AND EMAIL MATCHES → Show accept invitation screen
    return (
        <div className="center-page auth-card">
            <h2>Πρόσκληση</h2>
            <p>
                Έχεις πρόσκληση από την εταιρεία <b>{company?.name}</b> να γίνεις{" "}
                <b>{role.name}</b>.
            </p>

            {error && <p className="error-text">{error}</p>}

            <Button loading={submitting} onClick={handleAccept}>
                Αποδοχή Πρόσκλησης
            </Button>
        </div>
    );
}
