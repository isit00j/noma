package app.noma.notes;

/** Minimal home-screen widget: one focus note plus what's due. Calm by design. */
public class NomaFocusWidgetProvider extends NomaBaseWidgetProvider {
    @Override
    protected String kind() {
        return "focus";
    }
}
