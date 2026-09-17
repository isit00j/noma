package app.noma.notes;

/** Home-screen widget showing the user's notes (recent / pinned / favorites / folder / tag). */
public class NomaNoteWidgetProvider extends NomaBaseWidgetProvider {
    @Override
    protected String kind() {
        return "note";
    }
}
