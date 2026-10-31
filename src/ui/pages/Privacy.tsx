// The privacy page: what the site stores, where, who sees it, and how to delete it. Keep it in
// step with the code (persistence/, auth/, multiplayer/, ui/analytics.ts) when that changes.
import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <article className="page privacy">
      <h1>Privacy</h1>
      <p className="lead">What Felt School stores, why, where it is kept, and how to delete it. Felt School uses play chips only: there is no real money.</p>
      <p className="note">Last updated 31 October 2026.</p>

      <h2>Without an account</h2>
      <p>
        Your practice hands, lesson progress, saved ranges, settings and daily puzzle results are saved in your own browser and are not sent to us. Clearing your
        browser’s data for this site, or <Link to="/progress">Reset everything</Link> on the Progress page, removes them.
      </p>

      <h2>Live tables</h2>
      <ul>
        <li>
          Your browser makes a random secret key that your play chips belong to. Our table server only ever sees a scrambled (hashed) form of it, and stores your
          chip balance and daily claim under that.
        </li>
        <li>While you play, the table keeps your seat, the name you chose and your stack. Other players at the table see your name, your chips and your actions.</li>
        <li>
          Table chat is seen by the players seated at that table. It is kept in the table’s memory only: the last 50 messages, for up to an hour, and it is gone
          when the table restarts.
        </li>
      </ul>

      <h2>With an account</h2>
      <ul>
        <li>
          <strong>Sign-in:</strong> you sign in with Google, which shares your name, email address and profile picture with our sign-in provider. We use your
          first name as your starting display name, and never see your Google password.
        </li>
        <li>
          <strong>Your display name</strong>, which you can change on your Account page. It is shown at live tables. Your email address is never shown to other
          players.
        </li>
        <li>
          <strong>Your progress:</strong> lesson progress, saved ranges, settings, practice hands and daily puzzle results, so they are on every device you sign in
          on. Only you can read or change them.
        </li>
        <li>
          <strong>Your play chips</strong> and daily claims, stored by the table server under a number derived from your account, so other players never see your
          account details.
        </li>
        <li>Your browser keeps a sign-in session so you stay signed in. Signing out removes it, and your account’s progress, from that browser.</li>
      </ul>

      <h2>Analytics</h2>
      <p>
        We use Vercel Web Analytics to count visits and a few actions, such as opening a live table or signing in, along with general details like the kind of
        device and the country. It uses no cookies. We leave private table codes and saved-hand ids out of the addresses it sees, and never send it your name,
        email address, cards or chat.
      </p>

      <h2>Who stores it</h2>
      <ul>
        <li>Vercel hosts the website and runs the analytics.</li>
        <li>Cloudflare runs the live tables and the play-chip bank.</li>
        <li>Supabase runs sign-in and stores account data, in Canada.</li>
        <li>Google, only if you choose to sign in with Google.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or show ads.</p>

      <h2>Deleting your data</h2>
      <ul>
        <li>
          <strong>Account:</strong> <Link to="/account">Delete my account</Link> on the Account page deletes your account, profile and all saved progress straight
          away. Your play chips stay under an anonymous number that can no longer be linked to you.
        </li>
        <li>
          <strong>Without an account:</strong> clear this site’s data in your browser, or use Reset everything on the Progress page.
        </li>
      </ul>
    </article>
  );
}
