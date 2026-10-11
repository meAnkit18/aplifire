export default function Privacy() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 32, color: '#e8eaf0', lineHeight: 1.6 }}>
      <h1>Amplifier — Privacy Policy</h1>
      <p><i>Last updated: October 2026</i></p>
      <p>Amplifier is a personal tool that distributes videos you upload to YouTube channels you connect. This policy describes what data it handles.</p>
      <h2>Data we store</h2>
      <ul>
        <li><b>Google OAuth tokens:</b> when you connect a YouTube channel, Google issues an access token and refresh token. The refresh token is stored AES-256 encrypted in our database and used only to upload videos and read channel info on your behalf.</li>
        <li><b>Uploaded videos:</b> staged temporarily in Cloudinary and automatically deleted 1 hour after upload.</li>
        <li><b>Video metadata:</b> title, description, tags and privacy setting you enter, plus per-channel publish status.</li>
        <li><b>Login:</b> single-user password check; passwords are stored only as bcrypt hashes.</li>
      </ul>
      <h2>Data we share</h2>
      <p>Videos and metadata you choose to publish are sent to YouTube via the YouTube Data API v3. Nothing is sold or shared with any other party.</p>
      <h2>Data retention & deletion</h2>
      <p>Cloudinary copies auto-delete after 1 hour. Disconnecting a channel deletes its stored token. Contact the app owner to delete all data.</p>
      <h2>Contact</h2>
      <p>linserfix@gmail.com</p>
    </div>
  );
}
