import os
from datetime import date, datetime
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

db_url = os.environ.get("DATABASE_URL", "sqlite:///tracker.db")
# Render (and most managed Postgres providers) hand out a URL that starts
# with postgres:// but SQLAlchemy 1.4+ requires postgresql://
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

PHASES = ["Development", "Design", "Procurement", "Construction", "Commissioning", "Closeout"]
TYPES = ["Milestone", "Deliverable"]


class Project(db.Model):
    __tablename__ = "projects"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    phase = db.Column(db.String(50), nullable=False, default="Development")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    dates = db.relationship("KeyDate", backref="project", cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "code": self.code, "phase": self.phase}


class KeyDate(db.Model):
    __tablename__ = "key_dates"
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    title = db.Column(db.String(300), nullable=False)
    type = db.Column(db.String(30), nullable=False, default="Milestone")
    due_date = db.Column(db.Date, nullable=False)
    owner = db.Column(db.String(120), default="")
    notes = db.Column(db.Text, default="")
    complete = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "projectId": self.project_id,
            "title": self.title,
            "type": self.type,
            "date": self.due_date.isoformat(),
            "owner": self.owner or "",
            "notes": self.notes or "",
            "complete": bool(self.complete),
        }


with app.app_context():
    db.create_all()
    # Seed a couple of example rows the first time the app runs against an empty db
    if Project.query.count() == 0:
        p1 = Project(name="Sunbelt BESS", code="SUN-BESS", phase="Construction")
        p2 = Project(name="ASG-08 Solar", code="ASG-08", phase="Commissioning")
        db.session.add_all([p1, p2])
        db.session.flush()
        today = date.today()
        from datetime import timedelta
        db.session.add_all([
            KeyDate(project_id=p1.id, title="IFC Drawing Package Issue", type="Deliverable",
                    due_date=today - timedelta(days=3), owner="Amir"),
            KeyDate(project_id=p1.id, title="Arc Flash Study Final", type="Deliverable",
                    due_date=today + timedelta(days=2), owner="Amir"),
            KeyDate(project_id=p1.id, title="Substation Energization", type="Milestone",
                    due_date=today + timedelta(days=21)),
            KeyDate(project_id=p2.id, title="SCADA Commissioning Complete", type="Milestone",
                    due_date=today - timedelta(days=10), complete=True),
            KeyDate(project_id=p2.id, title="POI Fuse Retrofit", type="Deliverable",
                    due_date=today + timedelta(days=9)),
        ])
        db.session.commit()


def parse_date(value):
    return datetime.strptime(value, "%Y-%m-%d").date()


@app.route("/")
def index():
    return render_template("index.html", phases=PHASES, types=TYPES)


# ---------- Projects ----------

@app.route("/api/projects", methods=["GET"])
def list_projects():
    projects = Project.query.order_by(Project.created_at.asc()).all()
    return jsonify([p.to_dict() for p in projects])


@app.route("/api/projects", methods=["POST"])
def create_project():
    data = request.get_json(force=True)
    if not data.get("name") or not data.get("code"):
        return jsonify({"error": "name and code are required"}), 400
    p = Project(name=data["name"], code=data["code"], phase=data.get("phase", "Development"))
    db.session.add(p)
    db.session.commit()
    return jsonify(p.to_dict()), 201


@app.route("/api/projects/<int:project_id>", methods=["PUT"])
def update_project(project_id):
    p = Project.query.get_or_404(project_id)
    data = request.get_json(force=True)
    p.name = data.get("name", p.name)
    p.code = data.get("code", p.code)
    p.phase = data.get("phase", p.phase)
    db.session.commit()
    return jsonify(p.to_dict())


@app.route("/api/projects/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    p = Project.query.get_or_404(project_id)
    db.session.delete(p)
    db.session.commit()
    return jsonify({"deleted": True})


# ---------- Key dates ----------

@app.route("/api/dates", methods=["GET"])
def list_dates():
    dates = KeyDate.query.order_by(KeyDate.due_date.asc()).all()
    return jsonify([d.to_dict() for d in dates])


@app.route("/api/dates", methods=["POST"])
def create_date():
    data = request.get_json(force=True)
    required = ["title", "projectId", "date"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "title, projectId and date are required"}), 400
    d = KeyDate(
        project_id=data["projectId"],
        title=data["title"],
        type=data.get("type", "Milestone"),
        due_date=parse_date(data["date"]),
        owner=data.get("owner", ""),
        notes=data.get("notes", ""),
        complete=bool(data.get("complete", False)),
    )
    db.session.add(d)
    db.session.commit()
    return jsonify(d.to_dict()), 201


@app.route("/api/dates/<int:date_id>", methods=["PUT"])
def update_date(date_id):
    d = KeyDate.query.get_or_404(date_id)
    data = request.get_json(force=True)
    d.title = data.get("title", d.title)
    d.project_id = data.get("projectId", d.project_id)
    d.type = data.get("type", d.type)
    if data.get("date"):
        d.due_date = parse_date(data["date"])
    d.owner = data.get("owner", d.owner)
    d.notes = data.get("notes", d.notes)
    if "complete" in data:
        d.complete = bool(data["complete"])
    db.session.commit()
    return jsonify(d.to_dict())


@app.route("/api/dates/<int:date_id>/toggle", methods=["PATCH"])
def toggle_date(date_id):
    d = KeyDate.query.get_or_404(date_id)
    d.complete = not d.complete
    db.session.commit()
    return jsonify(d.to_dict())


@app.route("/api/dates/<int:date_id>", methods=["DELETE"])
def delete_date(date_id):
    d = KeyDate.query.get_or_404(date_id)
    db.session.delete(d)
    db.session.commit()
    return jsonify({"deleted": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
