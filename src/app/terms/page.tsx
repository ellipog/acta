import type { Metadata } from "next";
import Link from "next/link";
import { Fill, LegalPage } from "@/components/legal-page";
import { operator } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms",
  alternates: { canonical: "/terms" },
  description: "The agreement between you and Acta: accounts, plans, your content, public roadmaps and liability.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro={
        <p>
          These terms are the agreement between you and <Fill value={operator.name} /> (“Acta”, “we”) for using Acta.
          They’re written to be read. If something is unclear, ask us before you rely on it.
        </p>
      }
      summary={[
        "Your boards and everything in them belong to you.",
        "The Free plan has what you need to work. Enterprise adds controls for larger organisations.",
        "Anything you publish on a public roadmap can be seen by anyone.",
        "You can leave whenever you like, and take your data with you.",
      ]}
      sections={[
        {
          id: "about",
          title: "About these terms",
          body: (
            <>
              <p>
                By creating an account or using Acta you accept these terms and our{" "}
                <Link href="/privacy">privacy policy</Link>. If you use Acta for an organisation, you confirm you’re
                allowed to accept them on its behalf, and “you” then means the organisation too.
              </p>
            </>
          ),
        },
        {
          id: "account",
          title: "Your account",
          body: (
            <>
              <p>
                You need to be at least 13 to have an account, and older if your country requires it. Give us a real
                email address and keep access to it safe, since that’s how you sign in. You’re responsible for what
                happens in your account.
              </p>
              <p>
                Tell us at <Fill value={operator.email} /> if you think someone else has got into your account.
              </p>
            </>
          ),
        },
        {
          id: "plans",
          title: "Plans",
          body: (
            <>
              <p>
                <strong>Free</strong> includes boards, tables, timelines, teams and public roadmaps. It costs nothing.
                Storage, file uploads and the API are subject to fair use. If we ever need to set a firm limit, we’ll
                tell you before it applies to you.
              </p>
              <p>
                <strong>Enterprise</strong> adds single sign-on, user provisioning, an audit log, retention policies, a
                choice of data region, custom domains and support. It’s sold through an order form. Where the order form
                and these terms disagree, the order form wins.
              </p>
            </>
          ),
        },
        {
          id: "content",
          title: "Your content",
          body: (
            <>
              <p>
                You own what you put into Acta: boards, tasks, comments, files and everything else. We don’t claim any
                of it.
              </p>
              <p>
                To run the service you give us permission to store, copy, process and display your content, only as
                needed to provide Acta to you and the people you share it with. That permission ends when the content is
                deleted. We never sell your content.
              </p>
              <p>Make sure you have the right to upload what you upload.</p>
            </>
          ),
        },
        {
          id: "roadmaps",
          title: "Public roadmaps",
          body: (
            <>
              <p>
                A board you publish as a public roadmap can be seen by anyone with the link, and may show up in search
                engines. You choose what it shows, and you’re responsible for it.
              </p>
              <p>
                If you vote on or send an idea to someone’s roadmap, the owner of that board can read it, reply to it,
                and use it to shape their product, without owing you anything for it.
              </p>
              <p>
                We may hide or remove public content that’s illegal or breaks these terms. Report it to{" "}
                <Fill value={operator.email} />.
              </p>
            </>
          ),
        },
        {
          id: "use",
          title: "Using Acta fairly",
          body: (
            <>
              <p>Don’t use Acta to:</p>
              <ul>
                <li>break the law, or help someone else break it</li>
                <li>publish content that is hateful, harassing, or infringes someone else’s rights</li>
                <li>send spam, or spread malware or phishing</li>
                <li>get into accounts or data that aren’t yours, or test our security without our permission</li>
                <li>overload the service, or scrape it in ways that disrupt it for others</li>
                <li>resell Acta without an agreement with us</li>
              </ul>
            </>
          ),
        },
        {
          id: "service",
          title: "Availability and changes",
          body: (
            <p>
              We work to keep Acta running and your data safe, but we can’t promise it will never be down or never have
              a bug. We improve Acta all the time, and may change or remove features. If we remove something important
              you rely on, we’ll tell you in good time.
            </p>
          ),
        },
        {
          id: "ending",
          title: "Ending",
          body: (
            <>
              <p>
                You can stop using Acta and delete your account whenever you like, from your{" "}
                <Link href="/account">account page</Link>. Export anything you want to keep first.
              </p>
              <p>
                We may suspend or close an account that seriously or repeatedly breaks these terms. Unless the law or
                safety stops us, we’ll tell you why and give you a chance to export your data.
              </p>
              <p>
                After an account is closed, its data is deleted within 30 days, except where the law says we must keep
                it.
              </p>
            </>
          ),
        },
        {
          id: "liability",
          title: "Liability",
          body: (
            <>
              <p>
                Acta is provided as it is. As far as the law allows, we aren’t liable for indirect losses, such as lost
                profits, lost revenue or lost data you could have exported.
              </p>
              <p>
                Our total liability to you is limited to what you paid us in the 12 months before the claim, or NOK
                1,000 if that is more.
              </p>
              <p>
                None of this limits liability for gross negligence or intent, or rights you have as a consumer that
                can’t be taken away by contract.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: (
            <p>
              If we change these terms in a way that matters, we’ll tell you by email or in Acta at least 30 days before
              the change takes effect. If you don’t agree, you can delete your account before then.
            </p>
          ),
        },
        {
          id: "law",
          title: "Law and disputes",
          body: (
            <p>
              These terms are governed by Norwegian law. If we can’t settle a disagreement by talking, it goes to the
              Norwegian courts, with Oslo District Court as the agreed venue. If you’re a consumer, you can also bring a
              claim where you live.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Write to <Fill value={operator.email} />, or by post to <Fill value={operator.name} />,{" "}
              <Fill value={operator.address} />.
            </p>
          ),
        },
      ]}
    />
  );
}
