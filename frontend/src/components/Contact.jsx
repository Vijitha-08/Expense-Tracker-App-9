const Contact = () => {
  return (
    <section id="contact" className="contact">
      <h2>Contact Us</h2>
      <p>Have questions? We'd love to hear from you.</p>

      <form className="contact-form">
        <input type="text" placeholder="Your Name" />
        <input type="email" placeholder="Your Email" />
        <textarea placeholder="Your Message"></textarea>

        <button type="submit">Send Message</button>
      </form>
    </section>
  );
};

export default Contact;