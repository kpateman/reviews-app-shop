import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import {
  parseYotpoCsv,
  parseJudgeMeCsv,
  parseLeanReviewsCsv,
  detectCsvFormat,
  lookupProductsByHandle,
  searchProducts,
  importReviews,
} from "../utils/csv-import.server";
import { updateProductReviewCount } from "../utils/metafields.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "parse") {
    // Step 1: Parse CSV and look up products
    const csvText = formData.get("csvText");
    if (!csvText) {
      return { error: "No CSV data provided." };
    }

    try {
      const format = detectCsvFormat(csvText);
      if (format === "unknown") {
        return { error: "Unrecognised CSV format. Please upload a Lean Reviews, Yotpo, or Judge.me export file." };
      }
      const reviews =
        format === "judgeme" ? parseJudgeMeCsv(csvText) :
        format === "leanreviews" ? parseLeanReviewsCsv(csvText) :
        parseYotpoCsv(csvText);
      if (reviews.length === 0) {
        return { error: "No valid reviews found in the CSV file." };
      }

      // Extract unique product handles and look them up
      const handles = [...new Set(reviews.map((r) => r.productHandle).filter(Boolean))];
      const productMap = await lookupProductsByHandle(admin, handles);

      // Build product summary
      const productSummary = handles.map((handle) => ({
        handle,
        title: reviews.find((r) => r.productHandle === handle)?.productTitle || handle,
        matched: !!productMap[handle],
        shopifyId: productMap[handle]?.id || null,
        shopifyTitle: productMap[handle]?.title || null,
        reviewCount: reviews.filter((r) => r.productHandle === handle).length,
      }));

      const siteReviewCount = reviews.filter((r) => r.type === "company").length;
      const withImages = reviews.filter((r) => r.imageUrls.length > 0).length;

      return {
        step: "preview",
        reviews: reviews.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        productSummary,
        productMap,
        stats: {
          total: reviews.length,
          productReviews: reviews.length - siteReviewCount,
          siteReviews: siteReviewCount,
          withImages,
          matchedProducts: productSummary.filter((p) => p.matched).length,
          unmatchedProducts: productSummary.filter((p) => !p.matched).length,
        },
      };
    } catch (err) {
      return { error: `Failed to parse CSV: ${err.message}` };
    }
  }

  if (actionType === "searchProducts") {
    const query = formData.get("query");
    if (!query) return { searchResults: [] };
    const results = await searchProducts(admin, query);
    return { searchResults: results };
  }

  if (actionType === "import") {
    // Step 3: Run the import
    const reviewsJson = formData.get("reviews");
    const productMapJson = formData.get("productMap");
    const manualMappingsJson = formData.get("manualMappings");

    try {
      const reviews = JSON.parse(reviewsJson).map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
      }));
      const productMap = JSON.parse(productMapJson);
      const manualMappings = JSON.parse(manualMappingsJson || "{}");

      const results = await importReviews(shop, reviews, productMap, manualMappings);

      // Update metafield counts for affected products (fire and forget)
      for (const productId of results.affectedProductIds) {
        updateProductReviewCount(shop, productId).catch(() => {});
      }

      return { step: "done", results };
    } catch (err) {
      return { error: `Import failed: ${err.message}` };
    }
  }

  return { error: "Unknown action." };
}

export default function ImportPage() {
  const { shop } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const searchFetcher = useFetcher();

  const [csvText, setCsvText] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [manualMappings, setManualMappings] = useState({});
  const [searchHandle, setSearchHandle] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [overrideToUpload, setOverrideToUpload] = useState(false);

  const data = fetcher.data;
  const isLoading = fetcher.state !== "idle";
  const isSearching = searchFetcher.state !== "idle";

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  }, []);

  const handleStartOver = useCallback(() => {
    setCsvText(null);
    setFileName(null);
    setManualMappings({});
    setOverrideToUpload(true);
  }, []);

  const handleUpload = useCallback(() => {
    if (!csvText) return;
    setOverrideToUpload(false);
    const fd = new FormData();
    fd.set("action", "parse");
    fd.set("csvText", csvText);
    fetcher.submit(fd, { method: "post" });
  }, [csvText, fetcher]);

  const handleImport = useCallback(() => {
    if (!data?.reviews) return;
    const fd = new FormData();
    fd.set("action", "import");
    fd.set("reviews", JSON.stringify(data.reviews));
    fd.set("productMap", JSON.stringify(data.productMap));
    fd.set("manualMappings", JSON.stringify(manualMappings));
    fetcher.submit(fd, { method: "post" });
  }, [data, manualMappings, fetcher]);

  const handleProductSearch = useCallback(
    (handle, query) => {
      setSearchHandle(handle);
      setSearchQuery(query);
      const fd = new FormData();
      fd.set("action", "searchProducts");
      fd.set("query", query);
      searchFetcher.submit(fd, { method: "post" });
    },
    [searchFetcher],
  );

  const handleSelectProduct = useCallback(
    (handle, productId, productTitle) => {
      setManualMappings((prev) => ({ ...prev, [handle]: { id: productId, title: productTitle } }));
      setSearchHandle(null);
      setSearchQuery("");
    },
    [],
  );

  const handleSkipProduct = useCallback(
    (handle) => {
      setManualMappings((prev) => ({ ...prev, [handle]: "__skip__" }));
      setSearchHandle(null);
    },
    [],
  );

  // Calculate how many reviews will be imported
  const getImportableCount = () => {
    if (!data?.reviews || !data?.productSummary) return 0;
    const skippedHandles = new Set(
      Object.entries(manualMappings)
        .filter(([, v]) => v === "__skip__")
        .map(([k]) => k),
    );
    return data.reviews.filter((r) => {
      if (r.type === "company") return true;
      if (!r.productHandle) return false;
      if (skippedHandles.has(r.productHandle)) return false;
      const manual = manualMappings[r.productHandle];
      return data.productMap[r.productHandle] || (manual && manual !== "__skip__");
    }).length;
  };

  // Are all unmatched products resolved?
  const allResolved = () => {
    if (!data?.productSummary) return false;
    return data.productSummary
      .filter((p) => !p.matched)
      .every((p) => manualMappings[p.handle]);
  };

  return (
    <s-page heading="Import Reviews">
      <s-button slot="secondary-actions" variant="tertiary" onClick={() => navigate("/app")}>← Back to Home</s-button>
      {/* Step 1: Upload */}
      {(overrideToUpload || ((!data || data.error) && !data?.step)) && (
        <s-section heading="Import Reviews">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Upload a CSV export from Lean Reviews, Yotpo, or Judge.me to import your existing reviews. The format is detected automatically — including Lean Reviews' own export, so you can use this to restore a backup.
            </s-paragraph>

            {data?.error && (
              <s-banner heading="Error" tone="critical">
                <s-paragraph>{data.error}</s-paragraph>
              </s-banner>
            )}

            <s-box padding="loose" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="base" align="center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  style={{ fontSize: "14px" }}
                />
                {fileName && (
                  <s-text tone="subdued">
                    Selected: {fileName}
                  </s-text>
                )}
                <s-button
                  variant="primary"
                  onClick={handleUpload}
                  disabled={!csvText || isLoading}
                >
                  {isLoading ? "Parsing CSV..." : "Upload & Preview"}
                </s-button>
              </s-stack>
            </s-box>
          </s-stack>
        </s-section>
      )}

      {/* Step 2: Preview */}
      {!overrideToUpload && data?.step === "preview" && (
        <>
          <s-section heading="Import Preview">
            <s-stack direction="block" gap="base">
              {/* Stats */}
              <s-stack direction="inline" gap="loose">
                <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="120px">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingLg">{data.stats.total}</s-text>
                    <s-text>Total Reviews</s-text>
                  </s-stack>
                </s-box>
                <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="120px">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingLg">{data.stats.productReviews}</s-text>
                    <s-text>Product Reviews</s-text>
                  </s-stack>
                </s-box>
                <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="120px">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingLg">{data.stats.siteReviews}</s-text>
                    <s-text>Store Reviews</s-text>
                  </s-stack>
                </s-box>
                <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="120px">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingLg">{data.stats.withImages}</s-text>
                    <s-text>With Images</s-text>
                  </s-stack>
                </s-box>
              </s-stack>

              {data.stats.withImages > 0 && (
                <s-banner heading="Images will be re-uploaded" tone="info">
                  <s-paragraph>
                    {data.stats.withImages} review(s) have images that will be
                    re-uploaded to your image hosting. This may take a moment
                    during import.
                  </s-paragraph>
                </s-banner>
              )}
            </s-stack>
          </s-section>

          {/* Product Mapping */}
          <s-section heading="Product Mapping">
            <s-stack direction="block" gap="base">
              {data.stats.matchedProducts > 0 && (
                <s-text tone="success">
                  {data.stats.matchedProducts} product(s) matched automatically
                </s-text>
              )}

              {/* Matched products */}
              {data.productSummary
                .filter((p) => p.matched)
                .map((p) => (
                  <s-box
                    key={p.handle}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                  >
                    <s-stack direction="inline" gap="base" align="space-between">
                      <s-stack direction="block" gap="tight">
                        <s-text variant="headingSm">{p.shopifyTitle}</s-text>
                        <s-text tone="subdued">
                          {p.reviewCount} review(s) &bull; handle: {p.handle}
                        </s-text>
                      </s-stack>
                      <s-badge tone="success">Matched</s-badge>
                    </s-stack>
                  </s-box>
                ))}

              {/* Unmatched products */}
              {data.productSummary
                .filter((p) => !p.matched)
                .map((p) => (
                  <s-box
                    key={p.handle}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background={manualMappings[p.handle] ? undefined : "subdued"}
                  >
                    <s-stack direction="block" gap="base">
                      <s-stack direction="inline" gap="base" align="space-between">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="headingSm">{p.title}</s-text>
                          <s-text tone="subdued">
                            {p.reviewCount} review(s) &bull; handle: {p.handle}
                          </s-text>
                        </s-stack>
                        {manualMappings[p.handle] === "__skip__" ? (
                          <s-badge tone="warning">Skipped</s-badge>
                        ) : manualMappings[p.handle] ? (
                          <s-badge tone="success">Mapped</s-badge>
                        ) : (
                          <s-badge tone="critical">Not Found</s-badge>
                        )}
                      </s-stack>

                      {!manualMappings[p.handle] && (
                        <s-stack direction="block" gap="base">
                          <s-text tone="subdued">
                            This product wasn't found by its handle. Search for
                            it below or skip it.
                          </s-text>
                          <s-stack direction="inline" gap="base">
                            <div style={{ flex: 1 }}>
                              <input
                                type="text"
                                placeholder="Search your products..."
                                defaultValue={p.title}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleProductSearch(p.handle, e.target.value);
                                  }
                                }}
                                style={{
                                  width: "100%",
                                  padding: "8px",
                                  borderRadius: "4px",
                                  border: "1px solid #ccc",
                                  fontSize: "14px",
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                            <s-button
                              onClick={(e) => {
                                const input =
                                  e.target.closest("s-stack")?.querySelector("input");
                                if (input)
                                  handleProductSearch(p.handle, input.value);
                              }}
                              disabled={isSearching}
                            >
                              {isSearching && searchHandle === p.handle
                                ? "Searching..."
                                : "Search"}
                            </s-button>
                            <s-button
                              variant="tertiary"
                              onClick={() => handleSkipProduct(p.handle)}
                            >
                              Skip
                            </s-button>
                          </s-stack>

                          {/* Search results */}
                          {searchHandle === p.handle &&
                            searchFetcher.data?.searchResults && (
                              <s-stack direction="block" gap="tight">
                                {searchFetcher.data.searchResults.length === 0 ? (
                                  <s-text tone="subdued">
                                    No products found. Try a different search
                                    term.
                                  </s-text>
                                ) : (
                                  searchFetcher.data.searchResults.map(
                                    (product) => (
                                      <s-box
                                        key={product.id}
                                        padding="tight"
                                        borderWidth="base"
                                        borderRadius="base"
                                        onClick={() =>
                                          handleSelectProduct(
                                            p.handle,
                                            product.id,
                                            product.title,
                                          )
                                        }
                                        style={{ cursor: "pointer" }}
                                      >
                                        <s-stack
                                          direction="inline"
                                          gap="base"
                                        >
                                          {product.featuredImage?.url && (
                                            <img
                                              src={product.featuredImage.url}
                                              alt=""
                                              width={40}
                                              height={40}
                                              style={{
                                                objectFit: "cover",
                                                borderRadius: "4px",
                                              }}
                                            />
                                          )}
                                          <s-stack direction="block" gap="tight">
                                            <s-text variant="bodySm">
                                              {product.title}
                                            </s-text>
                                            <s-text tone="subdued">
                                              {product.handle}
                                            </s-text>
                                          </s-stack>
                                        </s-stack>
                                      </s-box>
                                    ),
                                  )
                                )}
                              </s-stack>
                            )}
                        </s-stack>
                      )}

                      {manualMappings[p.handle] && (
                        <s-button
                          variant="tertiary"
                          onClick={() =>
                            setManualMappings((prev) => {
                              const next = { ...prev };
                              delete next[p.handle];
                              return next;
                            })
                          }
                        >
                          Change
                        </s-button>
                      )}
                    </s-stack>
                  </s-box>
                ))}
            </s-stack>
          </s-section>

          {/* Import button */}
          <s-section>
            <s-stack direction="block" gap="base">
              {!allResolved() && data.stats.unmatchedProducts > 0 && (
                <s-banner heading="Unresolved products" tone="warning">
                  <s-paragraph>
                    Some products couldn't be matched automatically. Map or skip
                    them above before importing.
                  </s-paragraph>
                </s-banner>
              )}

              <s-stack direction="inline" gap="base">
                <s-button
                  variant="primary"
                  onClick={handleImport}
                  disabled={
                    isLoading ||
                    (!allResolved() && data.stats.unmatchedProducts > 0)
                  }
                >
                  {isLoading
                    ? "Importing..."
                    : `Import ${getImportableCount()} Reviews`}
                </s-button>
                <s-button
                  variant="tertiary"
                  onClick={handleStartOver}
                >
                  Start Over
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </>
      )}

      {/* Step 3: Done */}
      {!overrideToUpload && data?.step === "done" && (
        <s-section heading="Import Complete">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="loose">
              <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="120px">
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingLg" tone="success">
                    {data.results.imported}
                  </s-text>
                  <s-text>Imported</s-text>
                </s-stack>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="120px">
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingLg" tone="warning">
                    {data.results.skipped}
                  </s-text>
                  <s-text>Skipped</s-text>
                </s-stack>
              </s-box>
              {data.results.imageErrors > 0 && (
                <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="120px">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingLg" tone="critical">
                      {data.results.imageErrors}
                    </s-text>
                    <s-text>Image Errors</s-text>
                  </s-stack>
                </s-box>
              )}
            </s-stack>

            {data.results.errors.length > 0 && (
              <s-box padding="base" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingSm">Details</s-text>
                  {data.results.errors.slice(0, 20).map((err, i) => (
                    <s-text key={i} tone="subdued">
                      {err}
                    </s-text>
                  ))}
                  {data.results.errors.length > 20 && (
                    <s-text tone="subdued">
                      ...and {data.results.errors.length - 20} more
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            )}

            <s-stack direction="inline" gap="base">
              <s-button variant="primary" onClick={() => navigate("/app/reviews")}>
                View Reviews
              </s-button>
              <s-button
                variant="tertiary"
                onClick={handleStartOver}
              >
                Import More
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {/* Help sidebar */}
      <s-section slot="aside" heading="Supported Formats">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            The format is detected automatically from the file headers.
          </s-paragraph>
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">Lean Reviews</s-text>
            <s-text>Use the Export CSV button on the home page. You can re-import your own backup to restore reviews.</s-text>
          </s-stack>
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">Yotpo</s-text>
            <s-text>Go to Reviews → All Reviews → Export to download your CSV.</s-text>
          </s-stack>
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">Judge.me</s-text>
            <s-text>Go to Reviews → Import/Export → Export Reviews to download your CSV.</s-text>
          </s-stack>
          <s-text variant="headingSm">What gets imported:</s-text>
          <s-bulleted-list>
            <s-list-item>Review title, content &amp; rating</s-list-item>
            <s-list-item>Customer name &amp; email</s-list-item>
            <s-list-item>Original review date</s-list-item>
            <s-list-item>Images (re-uploaded to your image hosting)</s-list-item>
            <s-list-item>Product and store review types</s-list-item>
          </s-bulleted-list>
          <s-text variant="headingSm">Notes:</s-text>
          <s-bulleted-list>
            <s-list-item>Published reviews are imported as approved</s-list-item>
            <s-list-item>Duplicate reviews are automatically skipped</s-list-item>
            <s-list-item>Products are matched by handle, with manual mapping for any that don't match</s-list-item>
          </s-bulleted-list>
        </s-stack>
      </s-section>
    </s-page>
  );
}
