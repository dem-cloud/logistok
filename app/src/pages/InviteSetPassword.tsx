import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";
import { axiosPublic } from "../api/axios";
import Button from "../components/reusable/Button";
import PasswordInput from "../components/reusable/PasswordInput";
import { useAuth } from "@/contexts/AuthContext";
import LogoIcon from "../assets/logo_icon.png";
import styles from "./InviteSetPassword.module.css";

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || "#";

type Invite = {
    email: string;
    company: { id: string; name: string };
    role: { id: string; name: string };
    existing_user: boolean;
};

export default function InviteSetPassword() {
    const { token } = useParams();
    const navigate = useNavigate();
    const { user, logout, applyTokenAndRefresh } = useAuth();

    const [loading, setLoading] = useState(true);
    const [invite, setInvite] = useState<Invite | null>(null);
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const load = async () => {
            if (!token) {
                setLoading(false);
                return;
            }
            try {
                const res = await axiosPublic.get(`/api/shared/invite/${token}`);
                if (res.data?.success && res.data?.data) {
                    setInvite(res.data.data);
                } else {
                    setInvite(null);
                }
            } catch (err) {
                console.error(err);
                setInvite(null);
            } finally {
                setLoading(false);
            }
        };
        if (token) load();
        else setLoading(false);
    }, [token]);

    if (loading) return <Spinner />;
    if (!invite) {
        return (
            <div className={styles.auth}>
                <div className={styles.form}>
                    <div className={styles.image} onClick={() => (window.location.href = WEBSITE_URL)}>
                        <img alt="" src={LogoIcon} className={styles.logo} />
                    </div>
                    <div className={styles.title}>Η πρόσκληση δεν είναι διαθέσιμη</div>
                    <div className={styles.tagline}>Το link μπορεί να έχει λήξει ή να μην είναι έγκυρο.</div>
                    <div className={styles.footer}>
                        <div className={styles.backLink} onClick={() => navigate("/auth", { replace: true })}>
                            Πίσω στη Σύνδεση
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const invitedEmail = invite.email;
    const company = invite.company;
    const role = invite.role;
    const existingUser = invite.existing_user ?? false;

    // 1. Logged in with different email -> show "Wrong account"
    if (user && user.email !== invitedEmail) {
        return (
            <div className={styles.auth}>
                <div className={styles.form}>
                    <div className={styles.image} onClick={() => (window.location.href = WEBSITE_URL)}>
                        <img alt="" src={LogoIcon} className={styles.logo} />
                    </div>
                    <div className={styles.title}>Δεν έχετε πρόσβαση σε αυτή την πρόσκληση</div>
                    <div className={styles.tagline}>
                        Η πρόσκληση αφορά το email <b>{invitedEmail}</b>
                    </div>
                    <div className={styles.content}>
                        <Button onClick={() => logout({ skipNavigate: true })}>Αποσύνδεση και συνέχεια</Button>
                    </div>
                    <div className={styles.footer}>
                        <div className={styles.backLink} onClick={() => navigate("/auth", { replace: true })}>
                            Πίσω στη Σύνδεση
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 2. Existing user, logged in, same email -> redirect to select-company (accept there)
    if (existingUser && user?.email === invitedEmail) {
        navigate("/select-company", { replace: true });
        return <Spinner />;
    }

    // 3. Existing user, not logged in -> show "Log in to accept"
    if (existingUser) {
        return (
            <div className={styles.auth}>
                <div className={styles.form}>
                    <div className={styles.image} onClick={() => (window.location.href = WEBSITE_URL)}>
                        <img alt="" src={LogoIcon} className={styles.logo} />
                    </div>
                    <div className={styles.title}>Έχετε πρόσκληση</div>
                    <div className={styles.tagline}>
                        Έχετε πρόσκληση από την εταιρεία <b>{company?.name}</b> να γίνετε <b>{role?.name}</b>.
                        <br />
                        Συνδεθείτε στον λογαριασμό σας για να την αποδεχτείτε.
                    </div>
                    <div className={styles.content}>
                        <Button onClick={() => navigate("/auth", { replace: true })}>Σύνδεση</Button>
                    </div>
                    <div className={styles.footer}>
                        <div className={styles.backLink} onClick={() => navigate("/auth", { replace: true })}>
                            Πίσω στη Σύνδεση
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 4. New user -> password form, then POST /invite/accept
    const handleAccept = async () => {
        setSubmitting(true);
        setError("");
        try {
            const res = await axiosPublic.post("/api/shared/invite/accept", {
                token,
                password,
            });
            const { success, data } = res.data;
            if (!success) {
                setError(res.data?.message || "Παρουσιάστηκε σφάλμα");
                return;
            }
            if (data?.access_token) {
                await applyTokenAndRefresh(data.access_token);
            }
            navigate("/select-company", { replace: true });
        } catch (err) {
            console.error(err);
            setError("Κάτι πήγε στραβά. Προσπαθήστε ξανά.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.auth}>
            <div className={styles.form}>
                <div className={styles.image} onClick={() => (window.location.href = WEBSITE_URL)}>
                    <img alt="" src={LogoIcon} className={styles.logo} />
                </div>
                <div className={styles.title}>Καταχώρηση Κωδικού Πρόσβασης</div>
                <div className={styles.tagline}>
                    Έχετε πρόσκληση από την εταιρεία <b>{company?.name}</b>. Δημιουργήστε κωδικό για τον λογαριασμό σας.
                </div>
                <div className={styles.passwordForm}>
                    <PasswordInput
                        label="Κωδικός Πρόσβασης"
                        name="password"
                        value={password}
                        placeholder="Πληκτρολογήστε τον κωδικό"
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <PasswordInput
                        label="Επανάληψη Κωδικού"
                        name="password2"
                        value={password2}
                        placeholder="Πληκτρολογήστε ξανά τον κωδικό"
                        onChange={(e) => setPassword2(e.target.value)}
                    />
                    {error && <p className={styles.errorText}>{error}</p>}
                    <Button
                        loading={submitting}
                        disabled={password.length < 6 || password !== password2}
                        onClick={handleAccept}
                    >
                        Καταχώρηση Κωδικού
                    </Button>
                </div>
                <div className={styles.footer}>
                    <div className={styles.backLink} onClick={() => navigate("/auth", { replace: true })}>
                        Πίσω στη Σύνδεση
                    </div>
                </div>
            </div>
        </div>
    );
}
