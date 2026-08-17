import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Features from "../components/Features";
import HowItWorks from "../components/HowItWorks";
import Contact from "../components/Contact";
import Footer from "../components/Footer";
import About from "../components/About";

// The `.site` wrapper is the dark theme's scoping hook, and the reason it is a
// real element rather than a fragment.
//
// App.css styles the landing page with bare, unprefixed selectors - `.navbar`,
// `.hero`, `.step`, `.footer` - so there was nothing to hang a scoped override
// on. Rather than prefix all of them (which would touch every landing
// component) or flip the tokens in index.css (which would drag the user
// dashboard dark with no dark styling written for it), the dark block
// re-declares the token names on this one container. Everything inside then
// resolves dark; everything outside is untouched.
//
// `.auth` plays the same role for the sign-in pages and already existed.
const Home = () => {
  return (
    <div className="site">
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <About />
      <Contact />
      <Footer />
    </div>
  );
};

export default Home;
