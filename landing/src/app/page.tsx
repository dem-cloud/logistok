import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import Contact from "./sections/Contact";
import Features from "./sections/Features";
import HomeSection from "./sections/HomeSection";
import Industries from "./sections/Industries";
import Pricing from "./sections/Pricing";

export default function Home() {

    return (
        <main>

            <Navbar />
            
            <div className="pt-24 pb-8">
                <section id="home">
                    <HomeSection />
                </section>
                <section id="features">
                    <Features />
                </section>
                <section id="industries">
                    <Industries />
                </section>
                <section id="pricing">
                    <Pricing />
                </section>
                <section id="contact">
                    <Contact />
                </section>
            </div>

            <div className="-mt-[200px]">
            <Footer />
            </div>
        </main>
    );
}
