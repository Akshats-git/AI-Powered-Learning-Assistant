import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Globe, Search, Clock, BarChart3, Building2, Check } from "lucide-react";

import {
  getNetworkStatus,
  getWeakConcepts,
  discover,
  select,
  init,
  confirm,
  commitmentFor,
  priceOf,
  offerForResource,
} from "../../services/networkService";

// Finds learning material on an open Beckn network. The concept chips come
// from the same BKT estimate the dashboard's weak-areas panel uses, so the
// obvious search is the one the learner actually needs.

const KIND_LABELS = {
  course: "Course",
  quiz: "Quiz",
  "flashcard-deck": "Flashcard deck",
};

const formatPrice = ({ currency, value }) =>
  value === 0 ? "Free" : `${currency === "INR" ? "₹" : `${currency} `}${value}`;

const ResultSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
    <div className="h-4 w-40 bg-gray-100 rounded mb-2" />
    <div className="h-3 w-56 bg-gray-100 rounded mb-4" />
    <div className="flex gap-2">
      <div className="h-5 w-16 bg-gray-100 rounded-full" />
      <div className="h-5 w-20 bg-gray-100 rounded-full" />
    </div>
  </div>
);

const Tag = ({ children }) => (
  <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
    {children}
  </span>
);

const EnrolmentPanel = ({ enrolment, onClose }) => {
  const { step, quote, contract, resource, error } = enrolment;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <ol className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        {["select", "init", "confirm"].map((name, index) => {
          const reached = ["select", "init", "confirm", "done"].indexOf(step) >= index;
          return (
            <li key={name} className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                  reached ? "bg-primary text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                {index + 1}
              </span>
              <span className={reached ? "text-gray-700" : ""}>{name}</span>
              {index < 2 && <span className="text-gray-200">—</span>}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : step === "done" ? (
        <div className="rounded-lg bg-green-50 border border-green-100 p-3">
          <p className="text-sm font-medium text-green-800 flex items-center gap-1.5">
            <Check size={15} /> Enrolled in {resource.descriptor.name}
          </p>
          <p className="text-xs text-green-700 mt-1">
            Contract {contract.id} · {contract.status?.code} ·{" "}
            {contract.performance?.[0]?.status?.code}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-600">
          {quote ? `Quoted ${formatPrice(quote)} — agreeing the contract…` : "Requesting a quote…"}
        </p>
      )}

      {(step === "done" || error) && (
        <button type="button" onClick={onClose} className="mt-3 text-xs text-gray-500 hover:text-gray-700">
          Close
        </button>
      )}
    </div>
  );
};

const NetworkPage = () => {
  const [configured, setConfigured] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState({ transactionId: null, catalogs: [] });
  const [enrolment, setEnrolment] = useState(null);

  useEffect(() => {
    getNetworkStatus()
      .then((res) => setConfigured(res.data.configured))
      .catch(() => setConfigured(false));

    getWeakConcepts()
      .then((res) => setConcepts(res.data.concepts))
      .catch(() => setConcepts([]));
  }, []);

  const runSearch = async ({ concept, text }) => {
    setSearching(true);
    setEnrolment(null);
    try {
      const res = await discover({ concept, text });
      setResult(res.data);
      setSearched(true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) runSearch({ text: query.trim() });
  };

  // select -> init -> confirm, with each step's state visible as it happens:
  // three round trips to the provider node, each one a Beckn action.
  const enrol = async (catalog, resource) => {
    const offer = offerForResource(catalog, resource.id);
    if (!offer) return toast.error("This provider published no offer for that resource");

    const provider = catalog.bppId;
    const { transactionId } = result;
    const commitments = commitmentFor(resource, offer);
    const participants = [{ id: "learner", descriptor: { name: "Learner" } }];

    setEnrolment({ step: "select", resource });
    try {
      const selected = await select(provider, transactionId, { contract: { commitments } });
      const quote = {
        currency: selected.data.contract.consideration?.[0]?.considerationAttributes?.priceCurrency ?? "INR",
        value: Number(selected.data.contract.consideration?.[0]?.considerationAttributes?.price ?? 0),
      };

      setEnrolment({ step: "init", resource, quote });
      await init(provider, transactionId, { contract: { commitments, participants } });

      setEnrolment({ step: "confirm", resource, quote });
      const confirmed = await confirm(provider, transactionId, { contract: { commitments, participants } });

      setEnrolment({ step: "done", resource, quote, contract: confirmed.data.contract });
      toast.success("Enrolled");
    } catch (err) {
      setEnrolment({ step: "select", resource, error: err.response?.data?.message || "Enrolment failed" });
    }
  };

  if (configured === false) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Open network</h1>
        <div className="mt-6 bg-white rounded-xl border border-gray-100 p-6 max-w-2xl">
          <Globe className="text-gray-300 mb-3" size={28} />
          <h2 className="font-medium text-gray-900">This deployment is not on a Beckn subnet</h2>
          <p className="text-sm text-gray-500 mt-2">
            Searching other providers needs a subscriber record and a signing key. See{" "}
            <code className="text-xs bg-gray-50 border border-gray-100 rounded px-1 py-0.5">docs/beckn.md</code> for
            how to onboard, or run <code className="text-xs bg-gray-50 border border-gray-100 rounded px-1 py-0.5">npm run beckn:demo</code>{" "}
            to watch the whole flow against a local network.
          </p>
        </div>
      </div>
    );
  }

  const resultCount = result.catalogs.reduce((total, catalog) => total + (catalog.resources?.length || 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Open network</h1>
        <p className="text-sm text-gray-500 mt-1">
          Search other providers on the network for material on what you&apos;re weakest at.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses, decks and quizzes"
            aria-label="Search the network"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {concepts.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 mb-2">Your weakest concepts</p>
          <div className="flex flex-wrap gap-2">
            {concepts.map(({ concept, pKnown }) => (
              <button
                key={concept}
                type="button"
                onClick={() => runSearch({ concept })}
                className="inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-full px-3 py-1.5 hover:border-primary hover:text-primary transition-colors"
              >
                {concept}
                <span className="text-gray-400">{Math.round(pKnown * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {searching ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <ResultSkeleton key={i} />
          ))}
        </div>
      ) : searched && resultCount === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">No provider on the network answered with anything matching.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {result.catalogs.map((catalog) =>
            (catalog.resources || []).map((resource) => {
              const offer = offerForResource(catalog, resource.id);
              const attributes = resource.resourceAttributes || {};
              const active = enrolment?.resource?.id === resource.id;

              return (
                <div key={`${catalog.bppId}-${resource.id}`} className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{resource.descriptor.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Building2 size={12} /> {catalog.provider?.descriptor?.name}
                      </p>
                    </div>
                    {offer && (
                      <span className="text-sm font-medium text-gray-900 shrink-0">{formatPrice(priceOf(offer))}</span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 mt-2">{resource.descriptor.shortDesc}</p>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {attributes.kind && <Tag>{KIND_LABELS[attributes.kind] || attributes.kind}</Tag>}
                    {attributes.level && (
                      <Tag>
                        <BarChart3 size={11} /> {attributes.level}
                      </Tag>
                    )}
                    {attributes.durationMinutes && (
                      <Tag>
                        <Clock size={11} /> {attributes.durationMinutes} min
                      </Tag>
                    )}
                  </div>

                  {!active && (
                    <button
                      type="button"
                      onClick={() => enrol(catalog, resource)}
                      disabled={Boolean(enrolment) || !offer}
                      className="mt-4 w-full px-3 py-2 text-sm font-medium text-white bg-primary rounded-lg disabled:opacity-50"
                    >
                      Enrol
                    </button>
                  )}

                  {active && <EnrolmentPanel enrolment={enrolment} onClose={() => setEnrolment(null)} />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default NetworkPage;
